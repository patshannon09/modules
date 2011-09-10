<?php
/**
 * @file
 * Admin configuration for Bookmarklet.
 */

/**
 * Form to configure bookmarklet fields for a node type.
 */
function bookmarklet_node_type_form(&$form_state, $node_type) {
  // grab the fields, copied from vertical tabs
  module_load_include('inc', 'node', 'node.pages');

  // Build a psuedo-node for a sample node form.
  $node = (object) array(
    'type' => $node_type,
    'name' => '',
    'vid' => 0,
    'language' => '',
  );

  // Build a sample node form to find fieldsets.
  $node_form_state = array('values' => array());
  $node_form_id = $node_type .'_node_form';
  $args = array(
    $node_form_id,
    $node_form_state,
    $node
  );
  $node_form = drupal_retrieve_form($node_form_id, $node_form_state, $node);
  $node_form['#post'] = $node_form_state['values'];
  drupal_prepare_form($node_form_id, $node_form, $node_form_state);
  uasort($node_form, 'element_sort');

  $enabled = variable_get('bookmarklet_' . $node_type, array('body_field' => 1, 'buttons' => 1));
  // create a table form
  $elements = array();
  $elements = bookmarklet_discover_fields($node_form);
  $form['bookmarklet_' . $node_type] = array();
  $form['bookmarklet_' . $node_type]['#tree'] = TRUE;
  // for now don't regard children.
  foreach ($elements as $key => $values) {
    $label = $values['title'];
    if (!empty($values['type'])) {
      $label .= ' ('. $values['type'] .')';
    }
    $form['bookmarklet_' . $node_type][$key] = array(
      '#type' => 'checkbox',
      '#title' => check_plain($label),
      '#default_value' => $enabled[$key],
    );
  }
  return system_settings_form($form);
}

/**
 * Helper function to gather all enablable fields
 */
function bookmarklet_discover_fields($form) {
  $elements = array();
  foreach (element_children($form) as $key) {
    if ((empty($form[$key]['#type']) || !in_array($form[$key]['#type'], array('hidden', 'value', 'token')))) {
      $elements[$key]['type'] = $form[$key]['#type'];
      $elements[$key]['title'] = ($form[$key]['#title']? $form[$key]['#title'] : ($form[$key]['#value'] ? $form[$key]['#value'] : $key));
      if ($element['#type'] == 'fieldset' || empty($element['#type'])) {
        $children = bookmarklet_discover_fields( $form[$key]);
        if (!empty($form[$key]['#tree'])) {
          // this is going to be ignored for now
          $elements[$key]['children'] = $children;
        }
        elseif (!empty($children)) {
          $elements += $children;
        }
      }
    }
  }
  return $elements;
}
